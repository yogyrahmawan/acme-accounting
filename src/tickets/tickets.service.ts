import { ConflictException, Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { User, UserRole } from '../../db/models/User';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';

const ticketTypeToUserRole: Record<TicketType, UserRole> = {
  [TicketType.managementReport]: UserRole.accountant,
  [TicketType.registrationAddressChange]: UserRole.corporateSecretary,
  [TicketType.strikeOff]: UserRole.director,
};

const ticketTypeToCategory: Record<TicketType, TicketCategory> = {
  [TicketType.managementReport]: TicketCategory.accounting,
  [TicketType.registrationAddressChange]: TicketCategory.corporate,
  [TicketType.strikeOff]: TicketCategory.management,
};

@Injectable()
export class TicketsService {
  private async findLatestUserWithRole(role: UserRole, companyId: number) {
    const users = await User.findAll({
      where: { companyId, role },
      order: [['createdAt', 'DESC']],
    });

    if (!users.length) {
      throw new ConflictException(
        `Cannot find user with role ${role} to create a ticket`,
      );
    }

    return users[0];
  }

  private async findSingleUserWithRole(role: UserRole, companyId: number) {
    const users = await User.findAll({
      where: { companyId, role },
    });

    if (users.length > 1) {
      throw new ConflictException(
        `Multiple users with role ${role}. Cannot create a ticket`,
      );
    }

    if (users.length === 0) {
      throw new ConflictException(
        `Cannot find user with role ${role} to create a ticket`,
      );
    }

    return users[0];
  }

  private async ensureNoDuplicateRegistrationAddressChangeTicket(
    companyId: number,
  ) {
    const existing = await Ticket.findOne({
      where: {
        companyId,
        type: TicketType.registrationAddressChange,
        status: {
          [Op.ne]: TicketStatus.resolved,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Company ${companyId} already has a registration address change ticket`,
      );
    }
  }

  private async resolveActiveTickets(companyId: number) {
    await Ticket.update(
      { status: TicketStatus.resolved },
      {
        where: {
          companyId,
          status: TicketStatus.open,
        },
      },
    );
  }

  async createTicket({
    type,
    companyId,
  }: {
    type: TicketType;
    companyId: number;
  }): Promise<Ticket> {
    const category = ticketTypeToCategory[type];
    const primaryRole = ticketTypeToUserRole[type];

    if (!category || !primaryRole) {
      throw new ConflictException(`Invalid ticket type: ${type}`);
    }

    if (type === TicketType.registrationAddressChange) {
      await this.ensureNoDuplicateRegistrationAddressChangeTicket(companyId);
    }

    if (type === TicketType.strikeOff) {
      await this.resolveActiveTickets(companyId);
    }

    let assignee: User;

    switch (type) {
      case TicketType.managementReport: {
        assignee = await this.findLatestUserWithRole(primaryRole, companyId);
        break;
      }
      case TicketType.registrationAddressChange: {
        const secretaries = await User.findAll({
          where: { companyId, role: UserRole.corporateSecretary },
        });

        if (secretaries.length > 1) {
          throw new ConflictException(
            `Multiple users with role ${UserRole.corporateSecretary}. Cannot create a ticket`,
          );
        }

        if (secretaries.length === 1) {
          assignee = secretaries[0];
          break;
        }

        assignee = await this.findSingleUserWithRole(
          UserRole.director,
          companyId,
        );
        break;
      }
      case TicketType.strikeOff: {
        assignee = await this.findSingleUserWithRole(primaryRole, companyId);
        break;
      }
      default: {
        throw new ConflictException(`Unhandled ticket type: ${type}`);
      }
    }

    return Ticket.create({
      companyId,
      assigneeId: assignee.id,
      category,
      type,
      status: TicketStatus.open,
    });
  }
}